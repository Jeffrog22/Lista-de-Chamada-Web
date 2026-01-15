import React, { useEffect, useState } from "react";
import { getAllClasses, addClass, updateClass, deleteClass } from "../api";
import "./Classes.css";

interface Class {
  Turma: string;
  Horario: string;
  Professor: string;
  Nivel?: string;
  Atalho?: string;
  DataInicio?: string;
}

export const Classes: React.FC = () => {
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [formData, setFormData] = useState<Partial<Class>>({});
  const [searchTerm, setSearchTerm] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await getAllClasses();
      setClasses(r.data || []);
    } catch (err) {
      console.error("Erro ao carregar turmas:", err);
      alert("Erro ao carregar turmas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredClasses = classes.filter(
    (c) =>
      c.Turma.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.Professor.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddClick = () => {
    setEditingClass(null);
    setFormData({});
    setShowForm(true);
  };

  const handleEditClick = (classData: Class) => {
    setEditingClass(classData);
    setFormData(classData);
    setShowForm(true);
  };

  const handleSave = async () => {
    try {
      if (editingClass) {
        await updateClass(
          editingClass.Turma,
          editingClass.Horario,
          editingClass.Professor,
          formData
        );
        alert("Turma atualizada com sucesso!");
      } else {
        await addClass(formData);
        alert("Turma adicionada com sucesso!");
      }
      setShowForm(false);
      await load();
    } catch (err) {
      console.error("Erro ao salvar turma:", err);
      alert("Erro ao salvar turma");
    }
  };

  const handleDelete = async (classData: Class) => {
    if (confirm(`Deseja excluir a turma ${classData.Turma} - ${classData.Horario}?`)) {
      try {
        await deleteClass(classData.Turma, classData.Horario, classData.Professor);
        alert("Turma excluída com sucesso!");
        await load();
      } catch (err) {
        console.error("Erro ao excluir turma:", err);
        alert("Erro ao excluir turma");
      }
    }
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="classes-container">
      <div className="classes-header">
        <h2>Gerenciar Turmas</h2>
        <div className="header-actions">
          <input
            type="text"
            placeholder="Buscar turma..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <button onClick={handleAddClick} className="btn-primary">
            ? Adicionar Turma
          </button>
          <button onClick={load} disabled={loading} className="btn-secondary">
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{editingClass ? "Editar Turma" : "Adicionar Turma"}</h3>
            <form className="class-form">
              <div className="form-group">
                <label>Nome da Turma:</label>
                <input
                  type="text"
                  name="Turma"
                  value={formData.Turma || ""}
                  onChange={handleFormChange}
                  disabled={!!editingClass}
                  required
                />
              </div>

              <div className="form-group">
                <label>Horário:</label>
                <input
                  type="text"
                  name="Horario"
                  value={formData.Horario || ""}
                  onChange={handleFormChange}
                  placeholder="HH:MM"
                  disabled={!!editingClass}
                  required
                />
              </div>

              <div className="form-group">
                <label>Professor:</label>
                <input
                  type="text"
                  name="Professor"
                  value={formData.Professor || ""}
                  onChange={handleFormChange}
                  disabled={!!editingClass}
                  required
                />
              </div>

              <div className="form-group">
                <label>Nível:</label>
                <input
                  type="text"
                  name="Nivel"
                  value={formData.Nivel || ""}
                  onChange={handleFormChange}
                />
              </div>

              <div className="form-group">
                <label>Atalho:</label>
                <input
                  type="text"
                  name="Atalho"
                  value={formData.Atalho || ""}
                  onChange={handleFormChange}
                />
              </div>

              <div className="form-group">
                <label>Data de Início:</label>
                <input
                  type="date"
                  name="DataInicio"
                  value={formData.DataInicio || ""}
                  onChange={handleFormChange}
                />
              </div>

              <div className="form-actions">
                <button type="button" onClick={handleSave} className="btn-success">
                  Salvar
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="classes-table-wrapper">
        <table className="classes-table">
          <thead>
            <tr>
              <th>Turma</th>
              <th>Horário</th>
              <th>Professor</th>
              <th>Nível</th>
              <th>Data de Início</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredClasses.map((classData, idx) => (
              <tr key={idx}>
                <td>{classData.Turma}</td>
                <td>{classData.Horario}</td>
                <td>{classData.Professor}</td>
                <td>{classData.Nivel || "-"}</td>
                <td>{classData.DataInicio || "-"}</td>
                <td className="actions-cell">
                  <button onClick={() => handleEditClick(classData)} className="btn-edit">
                    ?? Editar
                  </button>
                  <button onClick={() => handleDelete(classData)} className="btn-delete">
                    ??? Deletar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredClasses.length === 0 && !loading && (
        <div className="no-data-message">Nenhuma turma encontrada</div>
      )}
    </div>
  );
};
